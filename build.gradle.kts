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
// grpc-conventions) gets a `test`-only JacocoReport of its own; uliss-design-system is the one
// exception (plain java-library + node, no Kotlin/JVM tests).
val coverageProjects = subprojects.filter { it.name != "uliss-design-system" }

tasks.register<JacocoReport>("jacocoRootReport") {
    group = "verification"
    description = "Merges per-module JaCoCo unit test coverage (test task only) into one report."
    dependsOn(coverageProjects.map { it.tasks.named("test") })

    sourceDirectories.setFrom(coverageProjects.map { it.layout.projectDirectory.dir("src/main/kotlin") })
    classDirectories.setFrom(
        coverageProjects.map { proj ->
            proj.fileTree(proj.layout.buildDirectory.dir("classes/kotlin/main")) {
                exclude("io/uliss/api/**")
            }
        },
    )
    // .filter { it.exists() } is lazy (re-evaluated at task execution) — modules with no test
    // sources (e.g. database, user-api) never produce a test.exec, so this skips them instead of
    // failing the report.
    executionData.setFrom(
        files(coverageProjects.map { it.layout.buildDirectory.file("jacoco/test.exec") }).filter { it.exists() },
    )

    reports {
        xml.required.set(true)
        html.required.set(true)
    }
}