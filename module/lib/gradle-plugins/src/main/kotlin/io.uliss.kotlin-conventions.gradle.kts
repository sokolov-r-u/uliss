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

// Coverage merges `test.exec` and `integrationTest.exec` (both are `Test`-type tasks, JaCoCo
// attaches to both automatically) when present. `dependsOn` is deliberately only on `test` —
// `integrationTest` (Docker/Testcontainers) is not forced here, so `./gradlew check`/`build` stay
// Docker-independent; the `fileTree` below just picks up `integrationTest.exec` if it's already
// on disk from a prior run. No jacocoTestCoverageVerification/threshold yet — see CLAUDE.md
// "Known deviations" for the tracked follow-up.
tasks.named<JacocoReport>("jacocoTestReport") {
    dependsOn(tasks.named("test"))
    executionData(
        fileTree(layout.buildDirectory.dir("jacoco")) {
            include("test.exec", "integrationTest.exec")
        },
    )
    sourceSets(sourceSets["main"])

    reports {
        xml.required.set(true)
        html.required.set(true)
    }

    // Excludes generated protobuf/gRPC stubs (user-api) and the Kotlin file-class holding the
    // top-level `main()` — that entrypoint is never invoked by any test (@SpringBootTest boots the
    // context via SpringApplicationBuilder directly) and running the app for real is off-limits.
    classDirectories.setFrom(
        classDirectories.files.map { dir ->
            fileTree(dir) { exclude("io/uliss/api/**", "**/*ApplicationKt.class") }
        },
    )
}

tasks.named("check") {
    dependsOn(tasks.named("jacocoTestReport"))
}
