import com.google.protobuf.gradle.id

plugins {
    id("io.uliss.kotlin-conventions")
    id("com.google.protobuf")
    idea
}

val libs = the<VersionCatalogsExtension>().named("libs")
val protobufVersion = libs.findVersion("protobuf").get().requiredVersion
val grpcVersion = libs.findVersion("grpc").get().requiredVersion

dependencies {
    implementation(libs.findLibrary("grpc-stub").get())
    implementation(libs.findLibrary("grpc-protobuf").get())
    implementation(libs.findLibrary("protobuf-java").get())

    // generated stubs reference @Generated (javax.annotation) — absent on JDK 9+
    compileOnly(libs.findLibrary("tomcat-annotations-api").get())
}

protobuf {
    protoc {
        artifact = "com.google.protobuf:protoc:$protobufVersion"
    }
    plugins {
        id("grpc") {
            artifact = "io.grpc:protoc-gen-grpc-java:$grpcVersion"
        }
    }
    generateProtoTasks {
        all().forEach { task ->
            task.plugins {
                id("grpc")
            }
        }
    }
}
