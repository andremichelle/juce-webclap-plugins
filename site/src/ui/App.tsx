import {Terminator} from "@opendaw/lib-std"
import {createElement, Frag, Router} from "@opendaw/lib-jsx"
import {Plugins} from "@/plugins"
import {Header} from "@/ui/Header"
import {HomePage} from "@/ui/pages/HomePage"
import {PluginPage} from "@/ui/pages/PluginPage"
import {NotFoundPage} from "@/ui/pages/NotFoundPage"

export const App = () => {
    const terminator = new Terminator()
    return (
        <Frag>
            <Header lifecycle={terminator}/>
            <Router<null>
                runtime={terminator}
                service={null}
                fallback={NotFoundPage}
                routes={[
                    {path: "/", factory: HomePage},
                    ...Plugins.map(plugin => ({path: `/${plugin.id}`, factory: PluginPage(plugin)}))
                ]}
            />
        </Frag>
    )
}
