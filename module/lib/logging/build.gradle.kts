plugins {
    id("io.uliss.kotlin-conventions")
}

version = "0.0.1"

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-aspectj")

    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}