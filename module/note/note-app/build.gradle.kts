plugins {
    id("io.uliss.spring-boot-app")
    id("io.uliss.jpa-conventions")
    id("io.uliss.docker-conventions")
}

version = "0.0.1"

dependencies {
    implementation(project(":security"))
    implementation(project(":database"))
    testImplementation(testFixtures(project(":database")))
    implementation(project(":exception"))
    implementation(project(":logging"))
    implementation(project(":validation"))
    implementation(project(":monitoring"))
    implementation(project(":feature-flags"))
    testImplementation(testFixtures(project(":feature-flags")))

    implementation(libs.spring.ai.starter.deepseek)
    implementation(libs.spring.ai.starter.openai)
    implementation(libs.pgvector)

    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("tools.jackson.module:jackson-module-kotlin")

    testImplementation("io.projectreactor:reactor-test")
    testImplementation(libs.jqwik)
    testImplementation(libs.jqwik.kotlin)
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

// SCHEMA.md: NoteSchemaSnapshotIntegrationTest compares it, updateSchemaSnapshot rewrites it
val schemaSnapshot = layout.projectDirectory.file("SCHEMA.md")

tasks.withType<Test>().configureEach {
    systemProperty("note.schema.file", schemaSnapshot.asFile.absolutePath)
    inputs.files(schemaSnapshot).withPropertyName("schemaSnapshot").optional()
}

tasks.register<Test>("updateSchemaSnapshot") {
    description = "Rewrites SCHEMA.md from the note schema after all migrations (Docker/Testcontainers)."
    group = "verification"
    testClassesDirs = sourceSets["test"].output.classesDirs
    classpath = sourceSets["test"].runtimeClasspath
    useJUnitPlatform { includeTags("integration") }
    filter { includeTestsMatching("io.uliss.note_service.schema.NoteSchemaSnapshotIntegrationTest") }
    systemProperty("note.schema.update", "true")
    outputs.upToDateWhen { false }
}
