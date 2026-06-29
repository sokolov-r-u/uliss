import com.github.gradle.node.npm.task.NpmTask

plugins {
	`java-library`
	alias(libs.plugins.node)
}

group = "io.uliss"
version = "0.0.1"

node {
	// npm workspaces live in the repo root package.json
	nodeProjectDir.set(rootProject.layout.projectDirectory)
	// Use the Node/npm already installed on the machine (set to true to let Gradle manage Node, e.g. on CI)
	download.set(false)
}

// Runs the design-system npm build (postcss autoprefixer -> dist/**, structure preserved)
val buildDesignSystem by tasks.registering(NpmTask::class) {
	dependsOn(tasks.named("npmInstall"))
	args.set(listOf("run", "build", "-w", "@uliss/design-system"))
	inputs.dir(layout.projectDirectory.dir("src"))
	inputs.file(layout.projectDirectory.file("package.json"))
	outputs.dir(layout.projectDirectory.dir("dist"))
}

// Pack the processed CSS, self-hosted fonts and assets into the jar so Spring Boot serves them
// from the classpath at /ds/** (webjar-style: META-INF/resources/**).
tasks.processResources {
	dependsOn(buildDesignSystem)
	into("META-INF/resources/ds") {
		from(layout.projectDirectory.dir("dist"))
		from(layout.projectDirectory.dir("src/fonts")) { into("fonts") }
	}
}
