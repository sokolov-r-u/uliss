import type {Dictionaries} from '@uliss/design-system'

/** The chat list and the chat header. */
const en = {
    newChat: 'New chat',
    chatDetails: 'Chat details',
    noChats: 'No chats yet',
    noChatsBody: 'Start a conversation. Uliss keeps the thread and writes a note when a thought is worth keeping.',
    startChat: 'Start a chat',
}

export const chatMessages: Dictionaries<typeof en> = {
    en,
    ru: {
        newChat: 'Новый чат',
        chatDetails: 'О чате',
        noChats: 'Чатов пока нет',
        noChatsBody: 'Начните разговор. Uliss сохранит его и напишет заметку, когда появится мысль, которую стоит сохранить.',
        startChat: 'Начать чат',
    },
}
