import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
    id("org.jetbrains.kotlin.jvm")
    id("org.jetbrains.kotlin.plugin.spring")
    id("io.spring.dependency-management")
    id("jacoco")
}

val libs = the<VersionCatalogsExtension>().named("libs")
val javaVersion = libs.findVersion("java").get().requiredVersion.toInt()
val javaCompileVersion = libs.findVersion("java-compile").get().requiredVersion.toInt()
val springBootVersion = libs.findVersion("spring-boot").get().requiredVersion
val jacocoVersion = libs.findVersion("jacoco").get().requiredVersion

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation(libs.findLibrary("kotlin-reflect").get())
}

group = "io.uliss"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(javaVersion)
    }
}

repositories {
    mavenCentral()
}

dependencyManagement {
    imports {
        mavenBom("org.springframework.boot:spring-boot-dependencies:$springBootVersion")
    }
}

jacoco {
    toolVersion = jacocoVersion
}

tasks.withType<JavaCompile>().configureEach {
    options.release = javaCompileVersion
}

tasks.withType<KotlinCompile>().configureEach {
    compilerOptions {
        jvmTarget = JvmTarget.fromTarget(javaCompileVersion.toString())
        freeCompilerArgs.addAll(
            "-Xjsr305=strict",
            "-Xannotation-default-target=param-property",
            "-Xmulti-dollar-interpolation",
        )
    }
}

tasks.named<Test>("test") {
    useJUnitPlatform() {
        excludeTags("integration")
    }
}

tasks.register<Test>("integrationTest") {
    description = "./gradlew integrationTest - now starts "
    testClassesDirs = sourceSets["test"].output.classesDirs
    classpath = sourceSets["test"].runtimeClasspath
    useJUnitPlatform() {
        includeTags("integration")
    }
    shouldRunAfter(tasks.named("test"))
}

// Coverage is sourced from `test` only, not `integrationTest` (Docker/Testcontainers) — keeps
// local coverage runs fast and dependency-free. Report-only for now: no jacocoTestCoverageVerification,
// no threshold — see CLAUDE.md "Known deviations" for the tracked follow-up.
tasks.named<JacocoReport>("jacocoTestReport") {
    dependsOn(tasks.named("test"))
    executionData(tasks.named<Test>("test").map { it.the<JacocoTaskExtension>().destinationFile!! })
    sourceSets(sourceSets["main"])

    reports {
        xml.required.set(true)
        html.required.set(true)
    }

    // No-op everywhere except user-api: excludes generated protobuf/gRPC stubs from coverage.
    classDirectories.setFrom(
        classDirectories.files.map { dir ->
            fileTree(dir) { exclude("io/uliss/api/**") }
        },
    )
}

tasks.named("check") {
    dependsOn(tasks.named("jacocoTestReport"))
}
