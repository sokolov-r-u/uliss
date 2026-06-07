pluginManagement {
    includeBuild("module/lib/gradle-plugins")
}

rootProject.name = "uliss"
include("auth", "user-service", "security")

project(":security").projectDir = file("module/lib/security")
project(":auth").projectDir = file("module/auth")
project(":user-service").projectDir = file("module/user-service")
