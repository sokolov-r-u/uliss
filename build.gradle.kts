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