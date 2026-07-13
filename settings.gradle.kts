pluginManagement {
    includeBuild("module/lib/gradle-plugins")
}

rootProject.name = "uliss"

include(
    "auth",
    "user-service",
    "user-api",
    "security",
    "database",
    "exception",
    "logging",
    "validation",
    "uliss-design-system"
)

project(":auth").projectDir = file("module/auth")
project(":user-service").projectDir = file("module/user-service/user-app")
project(":user-api").projectDir = file("module/user-service/user-api")
project(":security").projectDir = file("module/lib/security")
project(":database").projectDir = file("module/lib/database")
project(":exception").projectDir = file("module/lib/exception")
project(":logging").projectDir = file("module/lib/logging")
project(":validation").projectDir = file("module/lib/validation")
project(":uliss-design-system").projectDir = file("module/lib/uliss-design-system")
