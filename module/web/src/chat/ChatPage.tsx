import {useParams} from 'react-router-dom'

export function ChatPage() {
    const {chatId} = useParams<{ chatId: string }>()
    return (
        <div className="page">
            <div className="page-header">
                <h1 className="page-title">Chat {chatId}</h1>
            </div>
        </div>
    )
}
