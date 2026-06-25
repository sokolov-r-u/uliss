plugins {
	id("io.uliss.kotlin-conventions")
}

version = "0.0.1"

dependencies {
	api("org.springframework.boot:spring-boot-starter-security-oauth2-resource-server")
	implementation("org.springframework.boot:spring-boot-starter-web")
}