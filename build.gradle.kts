// modules configuration is moved to libs/gradle-plugins

plugins {
    id("jacoco")
}

repositories {
    mavenCentral()
}

val libsCatalog = the<VersionCatalogsExtension>().named("libs")

jacoco {
    toolVersion = libsCatalog.findVersion("jacoco").get().requiredVersion
}

// Every subproject applying io.uliss.kotlin-conventions (directly or via spring-boot-app /
// grpc-conventions) gets a JacocoReport of its own (test + integrationTest merged);
// uliss-design-system is the one exception (plain java-library + node, no Kotlin/JVM tests).
val coverageProjects = subprojects.filter { it.name != "uliss-design-system" }

tasks.register<JacocoReport>("jacocoRootReport") {
    group = "verification"
    description = "Merges per-module JaCoCo test + integrationTest coverage into one report."
    dependsOn(coverageProjects.map { it.tasks.named("test") })

    sourceDirectories.setFrom(coverageProjects.map { it.layout.projectDirectory.dir("src/main/kotlin") })
    // Excludes generated protobuf/gRPC stubs (user-api) and the Kotlin file-class holding the
    // top-level `main()` — never invoked by any test (@SpringBootTest boots the context via
    // SpringApplicationBuilder directly), so it can't be covered.
    classDirectories.setFrom(
        coverageProjects.map { proj ->
            proj.fileTree(proj.layout.buildDirectory.dir("classes/kotlin/main")) {
                exclude("io/uliss/api/**", "**/*ApplicationKt.class")
            }
        },
    )
    // fileTree is lazy (re-evaluated at task execution) and silently yields no entries for
    // missing files — modules with no test sources (e.g. database, user-api) never produce a
    // test.exec, and modules with no integration tests never produce an integrationTest.exec;
    // both are skipped instead of failing the report. integrationTest itself is not a dependency
    // here (Docker/Testcontainers) — its exec is merged in only if already present on disk.
    executionData.setFrom(
        coverageProjects.map { proj ->
            proj.fileTree(proj.layout.buildDirectory.dir("jacoco")) {
                include("test.exec", "integrationTest.exec")
            }
        },
    )

    reports {
        xml.required.set(true)
        html.required.set(true)
    }
}

// web is a plain npm/Vite workspace, not a Gradle subproject — its image build is a bare
// docker build, not Jib, so it can't share io.uliss.docker-conventions like auth/user/note.
// Version tag mirrors that convention (jib tags <project>:<version> + a :latest alias).
val webImageVersion =
    (groovy.json.JsonSlurper().parse(file("module/web/package.json")) as Map<*, *>)["version"] as String

val buildWebImage by tasks.registering(Exec::class) {
    group = "docker"
    description = "Builds the web Docker image (uliss/web:latest + uliss/web:$webImageVersion)."
    workingDir = rootDir
    // Same docker.executable property Jib uses (io.uliss.docker-conventions) — avoids resolving
    // a different "docker" than intended if PATH differs between the interactive shell and
    // whatever process ends up running this Exec task.
    val dockerExecutable = providers.gradleProperty("docker.executable").orNull?.takeIf { it.isNotBlank() }
        ?: error("Missing gradle property 'docker.executable' — copy gradle.properties.example to gradle.properties")
    commandLine(
        dockerExecutable, "build",
        "-t", "uliss/web:latest",
        "-t", "uliss/web:$webImageVersion",
        "-f", "module/web/Dockerfile", ".",
    )
}

tasks.register("buildAllImages") {
    group = "docker"
    description = "Builds all local Docker images (auth, user, note, web) in one command."
    dependsOn(
        ":auth:jibDockerBuild",
        ":user:jibDockerBuild",
        ":note:jibDockerBuild",
        buildWebImage,
    )
}