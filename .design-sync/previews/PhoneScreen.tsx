import {Bubble, ChatDock, Icon, ListRow, PhoneScreen, StarField, TopBar, Wordmark} from '@uliss/design-system'

// PhoneScreen fills its frame; the fixed 320×600 box stands in for the device.
const Frame = ({children}: { children: React.ReactNode }) => (
    <div style={{width: 320, height: 600}}>{children}</div>
)

export const NotesScreen = () => (
    <Frame>
        <PhoneScreen>
            <TopBar label="Notes" count={4} onMenu={() => undefined}/>
            <div style={{flex: 1, minHeight: 0, overflow: 'hidden', padding: '0 18px'}}>
                <ListRow title="The empty room" date="Jun 22" unread onClick={() => undefined}
                         meta={<><Icon name="star" size={12}/>4</>}/>
                <ListRow title="Notes on forgetting" date="Jun 18" dim onClick={() => undefined}
                         meta={<><Icon name="star" size={12}/>6</>}/>
                <ListRow title="Planning the autumn walk" date="Jun 14" dim onClick={() => undefined}
                         meta={<><Icon name="star" size={12}/>1</>}/>
                <ListRow title="Морской берег на рассвете" date="May 30" dim onClick={() => undefined}
                         meta={<><Icon name="star" size={12}/>1</>}/>
            </div>
        </PhoneScreen>
    </Frame>
)

export const ChatScreen = () => (
    <Frame>
        <PhoneScreen>
            <TopBar label="Chat" title="Why I keep returning to Ithaca" onMenu={() => undefined}/>
            <div style={{
                flex: 1, minHeight: 0, overflow: 'hidden', padding: '12px 18px', display: 'flex',
                flexDirection: 'column', gap: 20
            }}>
                <Bubble role="uliss">You have come back to this thought three times.</Bubble>
                <Bubble role="me">It keeps being the same problem in different clothes.</Bubble>
            </div>
            <ChatDock placeholder="Write a thought…" value="" onChange={() => undefined} voiceDisabled/>
        </PhoneScreen>
    </Frame>
)

export const SignIn = () => (
    <Frame>
        <PhoneScreen bg="var(--bg-deep)">
            <div style={{position: 'absolute', inset: 0, zIndex: 0}}>
                <StarField id="preview-phone" count={460} aspect={0.55} fadeStart={0.38}/>
            </div>
            <div style={{
                position: 'relative', zIndex: 1, flex: 1, display: 'flex', alignItems: 'center',
                justifyContent: 'center'
            }}>
                <Wordmark size={52} color="var(--wordmark-login)"/>
            </div>
        </PhoneScreen>
    </Frame>
)
