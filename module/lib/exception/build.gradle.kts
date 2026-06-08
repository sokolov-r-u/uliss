plugins {
    id("io.uliss.kotlin-conventions")
}

version = "0.0.1"

dependencies {
    implementation("org.springframework.retry:spring-retry:2.0.11")

    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.springframework.boot:spring-boot-starter-validation")
}