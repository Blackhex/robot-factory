// ─── Part types ──────────────────────────────────────────────────────────────

declare const enum PartType {
    //% block="Small Wheel"
    WheelSmall = 0,
    //% block="Medium Wheel"
    WheelMedium = 1,
    //% block="Large Wheel"
    WheelLarge = 2,
    //% block="Proximity Sensor"
    SensorProximity = 3,
    //% block="Camera Sensor"
    SensorCamera = 4,
    //% block="LIDAR Sensor"
    SensorLidar = 5,
    //% block="Standard Battery"
    BatteryStandard = 6,
    //% block="High-Capacity Battery"
    BatteryHighCapacity = 7,
    //% block="Light Chassis"
    ChassisLight = 8,
    //% block="Heavy Chassis"
    ChassisHeavy = 9,
    //% block="Basic Circuit"
    CircuitBasic = 10,
    //% block="Advanced Circuit"
    CircuitAdvanced = 11,
}

// ─── Machine slots ───────────────────────────────────────────────────────────
// Named references to placed machines. Players pick from this dropdown
// instead of typing string identifiers.

declare const enum Machine {
    //% block="Machine A"
    A = 0,
    //% block="Machine B"
    B = 1,
    //% block="Machine C"
    C = 2,
    //% block="Machine D"
    D = 3,
    //% block="Machine E"
    E = 4,
    //% block="Machine F"
    F = 5,
    //% block="Machine G"
    G = 6,
    //% block="Machine H"
    H = 7,
}

// ─── Recipe types ────────────────────────────────────────────────────────────

declare const enum Recipe {
    //% block="Small Wheels"
    WheelPressSmall = 0,
    //% block="Medium Wheels"
    WheelPressMedium = 1,
    //% block="Large Wheels"
    WheelPressLarge = 2,
    //% block="Proximity Sensors"
    SensorFabProximity = 3,
    //% block="Camera Sensors"
    SensorFabCamera = 4,
    //% block="LIDAR Sensors"
    SensorFabLidar = 5,
    //% block="Standard Batteries"
    BatteryAssemblyStandard = 6,
    //% block="High-Cap Batteries"
    BatteryAssemblyHigh = 7,
    //% block="Light Chassis"
    ChassisStamperLight = 8,
    //% block="Heavy Chassis"
    ChassisStamperHeavy = 9,
    //% block="Basic Circuits"
    CircuitPrinterBasic = 10,
    //% block="Advanced Circuits"
    CircuitPrinterAdvanced = 11,
    //% block="Basic Drivetrain"
    AssembleDrivetrainBasic = 12,
    //% block="Adv. Drivetrain"
    AssembleDrivetrainAdvanced = 13,
    //% block="Basic Sensor Array"
    AssembleSensorArrayBasic = 14,
    //% block="Adv. Sensor Array"
    AssembleSensorArrayAdvanced = 15,
    //% block="Std. Power Unit"
    AssemblePowerUnitStandard = 16,
    //% block="High Power Unit"
    AssemblePowerUnitHigh = 17,
    //% block="Explorer Robot"
    AssembleRobotExplorer = 18,
    //% block="Worker Robot"
    AssembleRobotWorker = 19,
    //% block="Guardian Robot"
    AssembleRobotGuardian = 20,
}

// ─── Belt slots ──────────────────────────────────────────────────────────────

declare const enum Belt {
    //% block="Belt 1"
    Belt1 = 0,
    //% block="Belt 2"
    Belt2 = 1,
    //% block="Belt 3"
    Belt3 = 2,
    //% block="Belt 4"
    Belt4 = 3,
    //% block="Belt 5"
    Belt5 = 4,
    //% block="Belt 6"
    Belt6 = 5,
    //% block="Belt 7"
    Belt7 = 6,
    //% block="Belt 8"
    Belt8 = 7,
}

// ─── Conditions ──────────────────────────────────────────────────────────────

declare const enum FactoryCondition {
    //% block="belt has items"
    BeltHasItems = 0,
    //% block="machine is idle"
    MachineIdle = 1,
    //% block="items remaining"
    ItemsRemaining = 2,
}
