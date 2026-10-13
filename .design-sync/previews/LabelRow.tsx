import {LabelRow} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const AboveField = () => (
    <Ground width={320}>
        <LabelRow label="Name"/>
    </Ground>
)

export const WithLiveValue = () => (
    <Ground width={320}>
        <LabelRow label="Name" right={
                                    <span style={{
                                       fontFamily: 'var(--font-text)',
                                       fontSize: 10,
                                       letterSpacing: '0.5px',
                                       color: 'var(--text-faint)'
                                   }}>
                08 / 24
            </span>
                               }/>
    </Ground>
)

export const SectionDividers = () => (
    <Ground width={320}>
        <div style={{display: 'grid', gap: 22}}>
            <LabelRow rule>Ground</LabelRow>
            <LabelRow rule>Accent</LabelRow>
            <LabelRow rule>Text size</LabelRow>
        </div>
    </Ground>
)
