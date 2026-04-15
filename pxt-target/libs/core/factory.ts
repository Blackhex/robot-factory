/**
 * Robot Factory — PXT block definitions.
 *
 * Blocks are organized into separate toolbox categories:
 *   • Machines  — start, stop, set recipe    (Machine dropdown)
 *   • Belts     — belt speed, routing         (Belt dropdown)
 *   • Loops     — repeat, while
 *   • Logic     — if-quality, if-item-type
 *   • Variables — set, get, change
 *   • Functions — define, call procedure
 *   • Events    — on-order, on-jam, on-idle
 *
 * Machine, Recipe, and Belt parameters use enum dropdowns so users
 * never need to type string identifiers.
 */

// ═══════════════════════════════════════════════════════════════════
//  MACHINES  (blue — colour 217)
// ═══════════════════════════════════════════════════════════════════

//% color=217 weight=100 icon="\uf0e7" block="Machines"
namespace machines {
    //% block="start %machine"
    //% blockId=factory_start_machine
    //% weight=100
    export function startMachine(machine: Machine): void { }

    //% block="stop %machine"
    //% blockId=factory_stop_machine
    //% weight=90
    export function stopMachine(machine: Machine): void { }

    //% block="set recipe of %machine to %recipe"
    //% blockId=factory_set_recipe
    //% weight=80
    export function setRecipe(machine: Machine, recipe: Recipe): void { }

    //% block="on %machine idle"
    //% blockId=factory_on_machine_idle
    //% weight=70
    //% handlerStatement=1
    export function onMachineIdle(machine: Machine, handler: () => void): void { }
}

// ═══════════════════════════════════════════════════════════════════
//  BELTS  (orange — colour 25)
// ═══════════════════════════════════════════════════════════════════

//% color=25 weight=80 icon="\uf018" block="Belts"
namespace belts {
    //% block="set %belt speed to %speed"
    //% blockId=factory_set_belt_speed
    //% weight=100
    //% speed.defl=1 speed.min=0 speed.max=10
    export function setBeltSpeed(belt: Belt, speed: number): void { }

    //% block="route to %machine"
    //% blockId=factory_route_to
    //% weight=90
    export function routeTo(machine: Machine): void { }
}

// ═══════════════════════════════════════════════════════════════════
//  LOOPS  (green — colour 120)
// ═══════════════════════════════════════════════════════════════════

//% color=120 weight=70 icon="\uf01e" block="Loops"
namespace loops {
    //% block="repeat %count times"
    //% blockId=factory_repeat_times
    //% weight=100
    //% count.defl=3 count.min=0
    //% handlerStatement=1
    export function repeatTimes(count: number, body: () => void): void { }

    //% block="while %condition"
    //% blockId=factory_while_condition
    //% weight=90
    //% handlerStatement=1
    export function whileCondition(condition: FactoryCondition, body: () => void): void { }
}

// ═══════════════════════════════════════════════════════════════════
//  LOGIC  (yellow — colour 60)
// ═══════════════════════════════════════════════════════════════════

//% color=60 weight=60 icon="\uf074" block="Logic"
namespace logic {
    //% block="if quality < %threshold then"
    //% blockId=factory_if_quality
    //% weight=100
    //% threshold.defl=50 threshold.min=0 threshold.max=100
    //% handlerStatement=1
    export function ifQuality(threshold: number, body: () => void): void { }

    //% block="if item is %itemType then"
    //% blockId=factory_if_item_type
    //% weight=90
    //% handlerStatement=1
    export function ifItemType(itemType: PartType, body: () => void): void { }
}

// ═══════════════════════════════════════════════════════════════════
//  VARIABLES  (cyan — colour 199)
// ═══════════════════════════════════════════════════════════════════

//% color=199 weight=50 icon="\uf1ec" block="Variables"
namespace variables_ {
    //% block="set %name to %value"
    //% blockId=factory_set_variable
    //% weight=100
    //% value.defl=0
    export function setVariable(name: string, value: number): void { }

    //% block="get %name"
    //% blockId=factory_get_variable
    //% weight=90
    export function getVariable(name: string): number { return 0 }

    //% block="change %name by %delta"
    //% blockId=factory_change_variable
    //% weight=80
    //% delta.defl=1
    export function changeVariable(name: string, delta: number): void { }
}

// ═══════════════════════════════════════════════════════════════════
//  FUNCTIONS  (magenta — colour 300)
// ═══════════════════════════════════════════════════════════════════

//% color=300 weight=40 icon="\uf0c1" block="Functions"
namespace functions_ {
    //% block="define procedure %name"
    //% blockId=factory_define_procedure
    //% weight=100
    //% handlerStatement=1
    export function defineProcedure(name: string, body: () => void): void { }

    //% block="call procedure %name"
    //% blockId=factory_call_procedure
    //% weight=90
    export function callProcedure(name: string): void { }
}

// ═══════════════════════════════════════════════════════════════════
//  EVENTS  (orange — colour 35)
// ═══════════════════════════════════════════════════════════════════

//% color=35 weight=30 icon="\uf0e7" block="Events"
namespace events {
    //% block="on order received"
    //% blockId=factory_on_order_received
    //% weight=100
    //% handlerStatement=1
    export function onOrderReceived(handler: () => void): void { }

    //% block="on belt jam"
    //% blockId=factory_on_belt_jam
    //% weight=90
    //% handlerStatement=1
    export function onBeltJam(handler: () => void): void { }
}
