import {Icon, ListRow} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const NotesIndex = () => (
    <Ground width={360} pad={18}>
        <ListRow title="The empty room" date="Jun 22" unread onClick={() => undefined}
                 meta={<><Icon name="star" size={12}/>4</>}/>
        <ListRow title="Notes on forgetting" date="Jun 18" dim onClick={() => undefined}
                 meta={<><Icon name="star" size={12}/>6</>}/>
        <ListRow title="Letter I never sent to my brother about the summer house" date="Jun 9" dim
                 onClick={() => undefined} meta={<><Icon name="star" size={12}/>2</>}/>
        <ListRow title="Морской берег на рассвете" date="May 30" dim onClick={() => undefined}
                 meta={<><Icon name="star" size={12}/>1</>}/>
    </Ground>
)

export const ChatsIndex = () => (
    <Ground width={360} pad={18}>
        <ListRow title="Why I keep returning to Ithaca" date="Jun 21" unread onClick={() => undefined}
                 meta={<><Icon name="noteDoc" size={12}/>3</>}/>
        <ListRow title="Planning the autumn walk" date="Jun 14" dim onClick={() => undefined}
                 meta={<><Icon name="noteDoc" size={12}/>1</>}/>
    </Ground>
)

export const FixtureRow = () => (
    <Ground width={360} pad={18}>
        <ListRow title="Trip to the coast" date="Jul 3" dots={false}/>
    </Ground>
)

export const WideList = () => (
    <Ground width={560} pad={24}>
        <ListRow size="wide" first title="The empty room" date="Jun 22" unread onClick={() => undefined}
                 meta={<><Icon name="star" size={12}/>4</>}/>
        <ListRow size="wide" title="Notes on forgetting" date="Jun 18" dim onClick={() => undefined}
                 meta={<><Icon name="star" size={12}/>6</>}/>
        <ListRow size="wide" title="Letter I never sent to my brother about the summer house" date="Jun 9" dim
                 onClick={() => undefined} meta={<><Icon name="star" size={12}/>2</>}/>
    </Ground>
)

export const NotesWithIcons = () => (
    <Ground width={360} pad={18}>
        <ListRow title="Giant Steps" icon="🎷" date="Jun 22" unread onClick={() => undefined}
                 meta={<><Icon name="star" size={12}/>4</>}/>
        <ListRow title="Notes on forgetting" icon={null} date="Jun 18" dim onClick={() => undefined}
                 meta={<><Icon name="star" size={12}/>6</>}/>
        <ListRow title="Kafka on the shore" icon="📚️" date="Jun 9" dim onClick={() => undefined}
                 meta={<><Icon name="star" size={12}/>2</>}/>
    </Ground>
)
