/**
 * Robot Factory — PXT block definitions.
 *
 * These annotations define the visual blocks shown in the MakeCode editor.
 * The runtime stubs are empty because execution happens on the game side:
 * PXT compiles blocks → TypeScript → the game's BlockInterpreter parses the
 * TypeScript source and produces SimulationCommand objects.
 */

//% color=260 weight=100 icon="\uf0e7" block="Factory"
//% groups="['Actions', 'Loops', 'Conditionals', 'Variables', 'Functions', 'Events']"
namespace factory {

    // ==================== Actions ====================

    //% block="produce %partType on %machine"
    //% blockId=factory_produce_part
    //% group="Actions" weight=100
    //% machine.defl="fabricator_1"
    export function producePart(machine: string, partType: PartType): void { }

    //% block="set recipe of %machine to %recipe"
    //% blockId=factory_set_recipe
    //% group="Actions" weight=90
    export function setRecipe(machine: string, recipe: string): void { }

    //% block="start machine %machine"
    //% blockId=factory_start_machine
    //% group="Actions" weight=80
    export function startMachine(machine: string): void { }

    //% block="stop machine %machine"
    //% blockId=factory_stop_machine
    //% group="Actions" weight=70
    export function stopMachine(machine: string): void { }

    //% block="set belt %belt speed to %speed"
    //% blockId=factory_set_belt_speed
    //% group="Actions" weight=60
    //% speed.defl=1 speed.min=0 speed.max=10
    export function setBeltSpeed(belt: string, speed: number): void { }

    //% block="route to %target"
    //% blockId=factory_route_to
    //% group="Actions" weight=50
    export function routeTo(target: string): void { }

    // ==================== Loops ====================

    //% block="repeat %count times"
    //% blockId=factory_repeat_times
    //% group="Loops" color=120 weight=100
    //% count.defl=3 count.min=0
    //% handlerStatement=1
    export function repeatTimes(count: number, body: () => void): void { }

    //% block="while %condition"
    //% blockId=factory_while_condition
    //% group="Loops" color=120 weight=90
    //% handlerStatement=1
    export function whileCondition(condition: FactoryCondition, body: () => void): void { }

    // ==================== Conditionals ====================

    //% block="if quality < %threshold then"
    //% blockId=factory_if_quality
    //% group="Conditionals" color=210 weight=100
    //% threshold.defl=50 threshold.min=0 threshold.max=100
    //% handlerStatement=1
    export function ifQuality(threshold: number, body: () => void): void { }

    //% block="if item is %itemType then"
    //% blockId=factory_if_item_type
    //% group="Conditionals" color=210 weight=90
    //% handlerStatement=1
    export function ifItemType(itemType: PartType, body: () => void): void { }

    // ==================== Variables ====================

    //% block="set %name to %value"
    //% blockId=factory_set_variable
    //% group="Variables" color=330 weight=100
    //% value.defl=0
    export function setVariable(name: string, value: number): void { }

    //% block="get %name"
    //% blockId=factory_get_variable
    //% group="Variables" color=330 weight=90
    export function getVariable(name: string): number { return 0 }

    //% block="change %name by %delta"
    //% blockId=factory_change_variable
    //% group="Variables" color=330 weight=80
    //% delta.defl=1
    export function changeVariable(name: string, delta: number): void { }

    // ==================== Functions ====================

    //% block="define procedure %name"
    //% blockId=factory_define_procedure
    //% group="Functions" color=290 weight=100
    //% handlerStatement=1
    export function defineProcedure(name: string, body: () => void): void { }

    //% block="call procedure %name"
    //% blockId=factory_call_procedure
    //% group="Functions" color=290 weight=90
    export function callProcedure(name: string): void { }

    // ==================== Events ====================

    //% block="on order received"
    //% blockId=factory_on_order_received
    //% group="Events" color=40 weight=100
    //% handlerStatement=1
    export function onOrderReceived(handler: () => void): void { }

    //% block="on belt jam"
    //% blockId=factory_on_belt_jam
    //% group="Events" color=40 weight=90
    //% handlerStatement=1
    export function onBeltJam(handler: () => void): void { }

    //% block="on machine %machine idle"
    //% blockId=factory_on_machine_idle
    //% group="Events" color=40 weight=80
    //% handlerStatement=1
    export function onMachineIdle(machine: string, handler: () => void): void { }
}
