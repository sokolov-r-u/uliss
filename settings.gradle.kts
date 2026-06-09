pluginManagement {
    includeBuild("module/lib/gradle-plugins")
}

rootProject.name = "uliss"

include(
    "auth",
    "user-service",
    "security",
    "database",
    "exception",
    "logging"
)

project(":auth").projectDir = file("module/auth")
project(":user-service").projectDir = file("module/user-service")
project(":security").projectDir = file("module/lib/security")
project(":database").projectDir = file("module/lib/database")
project(":exception").projectDir = file("module/lib/exception")
project(":logging").projectDir = file("module/lib/logging")
