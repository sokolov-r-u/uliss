plugins {
    id("io.uliss.kotlin-conventions")
}

version = "0.0.1"

dependencies {
    implementation(project(":logging"))

    // org.springframework.dao exceptions mapped to 409; no JPA is used here
    implementation("org.springframework:spring-tx")
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.springframework.boot:spring-boot-starter-validation")

    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}