package io.uliss.validation.util

const val EMAIL_PATTERN = "^(?=.{1,64}@.{1,255}$)(?:[a-zA-Z\\d]+[-_.]?)*@(?:[a-zA-Z\\d]+[-_.]?)*\\.[a-zA-Z]{2,16}$"
const val PASSWORD_PATTERN = "^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[#?!@$%^&*-]).{10,}$"