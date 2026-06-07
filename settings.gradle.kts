pluginManagement {
    includeBuild("module/lib/gradle-plugins")
}

rootProject.name = "uliss"
/**/
include(
    "auth",
    "user-service",
    "security",
    "database"
)

project(":auth").projectDir = file("module/auth")
project(":user-service").projectDir = file("module/user-service")
project(":security").projectDir = file("module/lib/security")
project(":database").projectDir = file("module/lib/database")
