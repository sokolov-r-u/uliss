package io.uliss.note_service.dto.internal

/** One page of a list ordered by `updated_at DESC, id DESC`; [nextCursor] is null on the last page. */
data class KeysetPage<T>(val items: List<T>, val nextCursor: ListCursor?) {

    fun <R> map(transform: (T) -> R): KeysetPage<R> = KeysetPage(items.map(transform), nextCursor)

    companion object {
        /** Builds a page from up to `limit + 1` [rows]: the extra row only tells that a next page exists. */
        fun <T> of(rows: List<T>, limit: Int, cursorOf: (T) -> ListCursor): KeysetPage<T> {
            val items = rows.take(limit)
            return KeysetPage(items, items.lastOrNull()?.takeIf { rows.size > limit }?.let(cursorOf))
        }
    }
}
