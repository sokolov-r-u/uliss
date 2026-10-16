plugins {
    id("io.uliss.kotlin-conventions")
}

version = "0.0.1"

dependencies {
    implementation(project(":exception"))
    implementation(project(":logging"))

    api("org.springframework.boot:spring-boot-starter-security-oauth2-resource-server")
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-security-oauth2-client")
    // AuditorAware interface for the JWT-aware auditor provider (no persistence pulled in).
    implementation("org.springframework.data:spring-data-commons")
    // SYSTEM_AUDITOR only: a const is inlined at compile time, so no runtime dependency on :database.
    compileOnly(project(":database"))
    testCompileOnly(project(":database"))

    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    testImplementation("tools.jackson.module:jackson-module-kotlin")
    testImplementation(libs.wiremock)
    testImplementation("org.springframework.security:spring-security-test")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}