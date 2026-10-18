// react-draggable-3d@0.0.1 predates React 19's removal of findDOMNode.
// Give only this dependency an explicit nodeRef lookup, in dev and production.
// Its drag lifecycle and mouse/touch handling remain the package implementation.
export function reactDraggable3dCompat() {
    return {
        name: "react-draggable-3d-node-ref",
        enforce: "pre",
        transform(code, id) {
            if (!id.replaceAll("\\", "/").endsWith("/react-draggable-3d/dist/react-draggable.js")) return null;
            return {
                code: code.replace(/ReactDOM\.findDOMNode\((\w+)\)/g, "$1.props.nodeRef?.current"),
                map: null,
            };
        },
    };
}
