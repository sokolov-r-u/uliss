package io.uliss.validation.util

const val EMAIL_PATTERN = "^(?=.{1,64}@.{1,255}$)(?:[a-zA-Z\\d]+[-_.]?)*@(?:[a-zA-Z\\d]+[-_.]?)*\\.[a-zA-Z]{2,16}$"
const val PASSWORD_PATTERN = "^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[#?!@$%^&*-]).{10,}$"
const val MIN_AGE_YEARS = 16
const val BIRTH_DATE_MESSAGE = "You must be at least 16 years old."