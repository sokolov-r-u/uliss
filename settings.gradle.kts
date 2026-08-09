pluginManagement {
    includeBuild("module/lib/gradle-plugins")
}

rootProject.name = "uliss"

include(
    "auth",
    "user",
    "user-api",
    "note",
    "security",
    "database",
    "exception",
    "logging",
    "validation",
    "uliss-design-system"
)

project(":auth").projectDir = file("module/auth")
project(":user").projectDir = file("module/user/user-app")
project(":user-api").projectDir = file("module/user/user-api")
project(":note").projectDir = file("module/note/note-app")
project(":security").projectDir = file("module/lib/security")
project(":database").projectDir = file("module/lib/database")
project(":exception").projectDir = file("module/lib/exception")
project(":logging").projectDir = file("module/lib/logging")
project(":validation").projectDir = file("module/lib/validation")
project(":uliss-design-system").projectDir = file("module/lib/uliss-design-system")
