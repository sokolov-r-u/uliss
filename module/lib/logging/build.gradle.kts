plugins {
    id("io.uliss.kotlin-conventions")
}

version = "0.0.1"

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-aspectj")
    // RequestTimingFilter only; the servlet services that register it bring both at runtime.
    compileOnly("org.springframework:spring-web")
    compileOnly("jakarta.servlet:jakarta.servlet-api")

    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}