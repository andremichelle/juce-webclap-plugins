import {createElement, LocalLink, PageFactory} from "@opendaw/lib-jsx"

export const NotFoundPage: PageFactory<null> = ({path}) => (
    <div style={{flex: "1 0 0", display: "flex", flexDirection: "column", rowGap: "1em",
        justifyContent: "center", alignItems: "center", color: "var(--color-dark)"}}>
        <span style={{fontSize: "25vmin"}}>404</span>
        <span>No plugin at {path}. <LocalLink href="/">All plugins</LocalLink></span>
    </div>
)
