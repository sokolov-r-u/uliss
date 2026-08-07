plugins {
	id("io.uliss.kotlin-conventions")
}

version = "0.0.1"

dependencies {
	implementation(project(":exception"))
	api("org.springframework.boot:spring-boot-starter-validation")

    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}