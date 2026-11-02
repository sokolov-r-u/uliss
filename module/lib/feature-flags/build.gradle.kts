plugins {
    id("io.uliss.kotlin-conventions")
    // the in-memory provider reaches consumers' tests only, not their jars
    `java-test-fixtures`
}

version = "0.0.1"

dependencies {
    api(libs.openfeature.sdk)
    implementation(libs.openfeature.flagd)
    implementation(project(":logging"))
    implementation("org.springframework.boot:spring-boot-autoconfigure")

    testFixturesApi(libs.openfeature.sdk)

    testImplementation("org.springframework.boot:spring-boot-test")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}
