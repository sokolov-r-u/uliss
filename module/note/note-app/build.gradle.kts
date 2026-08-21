plugins {
    id("io.uliss.spring-boot-app")
    id("io.uliss.jpa-conventions")
    id("io.uliss.docker-conventions")
}

version = "0.0.1"

dependencies {
    implementation(project(":security"))
    implementation(project(":database"))
    implementation(project(":exception"))
    implementation(project(":logging"))
    implementation(project(":validation"))
    implementation(project(":monitoring"))

    implementation(libs.spring.ai.starter.deepseek)
    implementation(libs.spring.ai.starter.openai)
    implementation(libs.spring.ai.starter.vector.store.pgvector)

    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("tools.jackson.module:jackson-module-kotlin")

    testImplementation("io.projectreactor:reactor-test")
    testImplementation("org.testcontainers:testcontainers-junit-jupiter")
    testImplementation("org.springframework.boot:spring-boot-testcontainers")
    testImplementation("org.testcontainers:testcontainers-postgresql")
    testImplementation("org.springframework.boot:spring-boot-starter-actuator-test")
    testImplementation("org.springframework.boot:spring-boot-starter-flyway-test")
    testImplementation("org.springframework.boot:spring-boot-starter-validation-test")
    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}
