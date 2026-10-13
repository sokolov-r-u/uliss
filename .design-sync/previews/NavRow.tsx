import {Icon, NavRow} from '@uliss/design-system'
import {Ground} from '../preview-kit/Ground'

export const Destinations = () => (
    <Ground width={260}>
        <NavRow icon={<Icon name="node"/>} label="Chats" active/>
        <NavRow icon={<Icon name="journal"/>} label="Notes"/>
        <NavRow icon={<Icon name="constellation" size={17}/>} label="Constellations"/>
        <NavRow icon={<Icon name="star"/>} label="Sky"/>
        <NavRow icon={<Icon name="pulse" size={17}/>} label="Updates" dot/>
    </Ground>
)

export const ActiveRow = () => (
    <Ground width={260}>
        <NavRow icon={<Icon name="journal"/>} label="Notes" active/>
    </Ground>
)

export const NewSomething = () => (
    <Ground width={260}>
        <NavRow icon={<Icon name="pulse" size={17}/>} label="Updates" dot/>
    </Ground>
)
