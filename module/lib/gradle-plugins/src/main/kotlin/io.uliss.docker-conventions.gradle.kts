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
            // jibDockerBuild always targets the local docker daemon, i.e. this build machine —
            // match its architecture instead of Jib's amd64 default, or arm64 hosts run under emulation.
            platforms {
                platform {
                    architecture = when (val arch = System.getProperty("os.arch")) {
                        "aarch64" -> "arm64"
                        "x86_64", "amd64" -> "amd64"
                        else -> error("Unsupported architecture for Jib base image: $arch")
                    }
                    os = "linux"
                }
            }
        }
        to {
            // CI passes -Pdocker.registry=ghcr.io/<owner> to push there instead; local
            // jibDockerBuild leaves it unset and keeps the uliss/<project> local-daemon convention.
            val registry = providers.gradleProperty("docker.registry").orNull?.takeIf { it.isNotBlank() }
            val repository = if (registry != null) "$registry/${project.name}" else "uliss/${project.name}"
            image = "$repository:${project.version}"
            tags = setOf("latest")
        }
        dockerClient {
            executable = requiredProperty("docker.executable")
        }
    }
}
