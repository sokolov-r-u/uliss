plugins {
    id("com.google.cloud.tools.jib")
}

fun requiredProperty(name: String): String =
    providers.gradleProperty(name).orNull?.takeIf { it.isNotBlank() }
        ?: error("Missing gradle property '$name' — copy gradle.properties.example to gradle.properties")

afterEvaluate {
    extensions.configure<com.google.cloud.tools.jib.gradle.JibExtension> {
        from {
            image = requiredProperty("docker.jre.version")
        }
        to {
            image = "uliss/${project.name}:${project.version}"
        }
        dockerClient {
            executable = requiredProperty("docker.executable")
        }
    }
}
