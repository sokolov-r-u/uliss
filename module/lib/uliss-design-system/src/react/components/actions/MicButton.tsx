import {Icon} from '../icons/Icon'

// The record affordance — the largest element in the product and the only
// circle in it. solid = idle (accent fill, dark glyph); ring = armed (hollow,
// accent-2 stroke, inner glow); pulse = recording (three concentric rings).
export interface MicButtonProps {
    /** solid = idle · ring = armed · pulse = recording (concentric rings). */
    variant?: 'solid' | 'ring' | 'pulse'
    /** Diameter in px. The glyph is always 0.34 × this. */
    size?: number
}

export function MicButton({variant = 'solid', size = 132}: MicButtonProps) {
    const ring = variant === 'ring'
    const pulse = variant === 'pulse'
    return (
        <div
            style={{
                position: 'relative',
                width: size,
                height: size,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            {pulse &&
                [1, 2, 3].map((i) => (
                    <div
                        key={i}
                        style={{
                            position: 'absolute',
                            width: size + i * 26,
                            height: size + i * 26,
                            border: '1px solid var(--accent)',
                            borderRadius: '50%',
                            opacity: 0.42 - i * 0.11,
                        }}
                    />
                ))}
            <div
                style={{
                    position: 'relative',
                    width: size,
                    height: size,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: ring ? 'transparent' : 'var(--accent)',
                    border: ring ? '2.5px solid var(--accent-2)' : '1px solid var(--accent-edge)',
                    boxShadow: ring
                        ? '0 0 22px 2px var(--accent-glow-mid), inset 0 0 24px var(--accent-glow-soft)'
                        : '0 0 30px 2px var(--accent-glow-mid)',
                    color: ring ? 'var(--accent-2)' : 'var(--bg-deep)',
                }}
            >
                <Icon name="mic" size={size * 0.34}/>
            </div>
        </div>
    )
}
