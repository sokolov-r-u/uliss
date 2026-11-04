import type {Locale} from './locale'

/** A message is a fixed string or a function of its parameters (a name, a count) that returns one. */
export type Message = string | ((...args: never[]) => string)

/**
 * The shape every translation of a dictionary must have: the same keys as the English source, each a string or a
 * function with the same parameters. A missing or extra key, or a changed parameter list, fails the type check.
 */
export type Translation<Source extends Record<string, Message>> = {
    [Key in keyof Source]: Source[Key] extends (...args: infer Args) => string ? (...args: Args) => string : string
}

/** One dictionary per locale; English is the source of keys. */
export type Dictionaries<Source extends Record<string, Message>> = Record<Locale, Translation<Source>>
