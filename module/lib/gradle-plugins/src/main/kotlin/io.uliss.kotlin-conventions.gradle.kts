import org.gradle.api.artifacts.VersionCatalogsExtension
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
    id("org.jetbrains.kotlin.jvm")
    id("org.jetbrains.kotlin.plugin.spring")
    id("io.spring.dependency-management")
}

val libs = the<VersionCatalogsExtension>().named("libs")
val javaVersion = libs.findVersion("java").get().requiredVersion.toInt()
val javaCompileVersion = libs.findVersion("java-compile").get().requiredVersion.toInt()
val springBootVersion = libs.findVersion("spring-boot").get().requiredVersion

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
