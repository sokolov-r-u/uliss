package io.uliss.validation.util

// dot-separated atoms of letters, digits and the usual specials (`+` sub-addressing, `'` in names); no leading,
// trailing or double dots; domain labels joined by dots, ending in a 2-16 letter TLD. Linear: every repetition is
// anchored on a dot.
const val EMAIL_PATTERN = "^(?=.{1,64}@)[a-zA-Z\\d!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-zA-Z\\d!#$%&'*+/=?^_`{|}~-]+)*" +
        "@(?:[a-zA-Z\\d](?:[a-zA-Z\\d-]{0,61}[a-zA-Z\\d])?\\.)+[a-zA-Z]{2,16}$"

/** `auth.users.email` is `varchar(254)`, the longest address SMTP allows. */
const val EMAIL_MAX_LENGTH = 254
const val PASSWORD_PATTERN = "^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[#?!@$%^&*-]).{10,}$"
const val MAX_PASSWORD_BYTES = 72
const val MIN_AGE_YEARS = 16
const val MAX_AGE_YEARS = 150
const val BIRTH_DATE_MESSAGE = "You must be at least {min} years old."