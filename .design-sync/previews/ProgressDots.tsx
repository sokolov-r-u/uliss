import {ProgressDots} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const Steps = () => (
    <Ground>
        <div style={{display: 'grid', gap: 16}}>
            <ProgressDots current={1} total={3}/>
            <ProgressDots current={2} total={3}/>
            <ProgressDots current={3} total={3}/>
        </div>
    </Ground>
)

export const NoticeWidth = () => (
    <Ground width={264}>
        <ProgressDots current={2} total={3}/>
    </Ground>
)
