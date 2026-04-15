/// <reference path="../node_modules/pxt-core/built/pxtsim.d.ts"/>

namespace pxsim {
    initCurrentRuntime = () => {
        runtime.board = new Board();
    };

    export function board(): Board {
        return runtime.board as Board;
    }

    export class Board extends pxsim.BaseBoard {
        constructor() {
            super();
        }

        initAsync(msg: pxsim.SimulatorRunMessage): any {
            return undefined as any;
        }

        updateView() {
            // No-op: rendering is handled by the game engine
        }
    }
}
