import com.github.gradle.node.npm.task.NpmTask

plugins {
	`java-library`
	alias(libs.plugins.node)
}

group = "io.uliss"
version = "0.0.2"

node {
	// npm workspaces live in the repo root package.json
	nodeProjectDir.set(rootProject.layout.projectDirectory)
	// Gradle downloads the Node version pinned in the repo-root .nvmrc, the same one CI and local development use
	download.set(true)
	version.set(rootProject.layout.projectDirectory.file(".nvmrc").asFile.readText().trim())
	// npm ci: install exactly the lockfile, never rewrite it during a Gradle build
	npmInstallCommand.set("ci")
}

// Runs the design-system npm build (postcss autoprefixer -> dist/**, structure preserved)
val buildDesignSystem = tasks.register<NpmTask>("buildDesignSystem") {
	description = "Builds the design-system CSS assets with PostCSS."
	dependsOn(tasks.named("npmInstall"))
	workingDir.set(rootProject.layout.projectDirectory.asFile)
	args.set(listOf("run", "build", "-w", "@uliss/design-system"))
	// a deleted or renamed source must not survive in dist/ and the jar
	doFirst { delete(layout.projectDirectory.dir("dist")) }
	inputs.dir(layout.projectDirectory.dir("src"))
	inputs.file(layout.projectDirectory.file("package.json"))
	outputs.dir(layout.projectDirectory.dir("dist"))
}

// Pack the processed CSS and self-hosted fonts into the jar so Spring Boot serves them
// from the classpath at /ds/** (webjar-style: META-INF/resources/**).
tasks.processResources {
	dependsOn(buildDesignSystem)
	into("META-INF/resources/ds") {
		from(layout.projectDirectory.dir("dist"))
		from(layout.projectDirectory.dir("src/fonts")) {
			into("fonts")
			exclude(".claude/**")
			exclude("**/.claude/**")
			includeEmptyDirs = false
		}
		exclude("**/.claude/**")
		includeEmptyDirs = false
	}
}
