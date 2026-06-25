plugins {
    id("io.uliss.kotlin-conventions")
    id("io.uliss.jpa-conventions")
}


version = "0.0.1"

dependencies {
    api("org.springframework.boot:spring-boot-starter-data-jpa")
    api("org.springframework.boot:spring-boot-starter-flyway")
    api("org.flywaydb:flyway-database-postgresql")
    api(libs.fasterxml.uuid.generator)
    runtimeOnly("org.postgresql:postgresql")
}