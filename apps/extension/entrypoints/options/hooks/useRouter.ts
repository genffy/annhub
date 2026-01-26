import { useState, useEffect } from 'react'

export type RouteParams = Record<string, string>

export interface Route {
    path: string
    component: React.ComponentType<any>
}

export function useRouter(routes: Route[], defaultPath: string = '/') {
    const [currentPath, setCurrentPath] = useState(() => {

        return window.location.hash.slice(1) || defaultPath
    })

    const navigate = (path: string) => {
        window.location.hash = path
        setCurrentPath(path)
    }

    const goBack = () => {
        window.history.back()
    }

    const goForward = () => {
        window.history.forward()
    }


    useEffect(() => {
        const handleHashChange = () => {
            const newPath = window.location.hash.slice(1) || defaultPath
            setCurrentPath(newPath)
        }

        window.addEventListener('hashchange', handleHashChange)

        return () => {
            window.removeEventListener('hashchange', handleHashChange)
        }
    }, [defaultPath])


    const findRoute = (path: string) => {
        return routes.find(route => route.path === path) || routes.find(route => route.path === defaultPath)
    }

    const currentRoute = findRoute(currentPath)

    return {
        currentPath,
        currentRoute,
        navigate,
        goBack,
        goForward,
        isActive: (path: string) => currentPath === path
    }
} 