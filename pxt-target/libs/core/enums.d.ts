// ─── Part types ──────────────────────────────────────────────────────────────

declare const enum PartType {
    //% block="Small Wheel"
    WheelSmall = 0,
    //% block="Medium Wheel"
    WheelMedium = 1,
    //% block="Large Wheel"
    WheelLarge = 2,
    //% block="Standard Battery"
    BatteryStandard = 3,
    //% block="High-Capacity Battery"
    BatteryHighCapacity = 4,
    //% block="Light Chassis"
    ChassisLight = 5,
    //% block="Heavy Chassis"
    ChassisHeavy = 6,
    //% block="Basic Circuit"
    CircuitBasic = 7,
    //% block="Advanced Circuit"
    CircuitAdvanced = 8,
}

// ─── Machine slots ───────────────────────────────────────────────────────────
// Named references to placed machines. Players pick from this dropdown
// instead of typing string identifiers.

declare const enum Machine {
    //% block="machine A"
    A = 0,
    //% block="machine B"
    B = 1,
    //% block="machine C"
    C = 2,
    //% block="machine D"
    D = 3,
    //% block="machine E"
    E = 4,
    //% block="machine F"
    F = 5,
    //% block="machine G"
    G = 6,
    //% block="machine H"
    H = 7,
    //% block="machine 9"
    M9 = 8,
    //% block="machine 10"
    M10 = 9,
    //% block="machine 11"
    M11 = 10,
    //% block="machine 12"
    M12 = 11,
    //% block="machine 13"
    M13 = 12,
    //% block="machine 14"
    M14 = 13,
    //% block="machine 15"
    M15 = 14,
    //% block="machine 16"
    M16 = 15,
    //% block="machine 17"
    M17 = 16,
    //% block="machine 18"
    M18 = 17,
    //% block="machine 19"
    M19 = 18,
    //% block="machine 20"
    M20 = 19,
    //% block="machine 21"
    M21 = 20,
    //% block="machine 22"
    M22 = 21,
    //% block="machine 23"
    M23 = 22,
    //% block="machine 24"
    M24 = 23,
    //% block="machine 25"
    M25 = 24,
    //% block="machine 26"
    M26 = 25,
    //% block="machine 27"
    M27 = 26,
    //% block="machine 28"
    M28 = 27,
    //% block="machine 29"
    M29 = 28,
    //% block="machine 30"
    M30 = 29,
    //% block="machine 31"
    M31 = 30,
    //% block="machine 32"
    M32 = 31,
    //% block="machine 33"
    M33 = 32,
    //% block="machine 34"
    M34 = 33,
    //% block="machine 35"
    M35 = 34,
    //% block="machine 36"
    M36 = 35,
    //% block="machine 37"
    M37 = 36,
    //% block="machine 38"
    M38 = 37,
    //% block="machine 39"
    M39 = 38,
    //% block="machine 40"
    M40 = 39,
    //% block="machine 41"
    M41 = 40,
    //% block="machine 42"
    M42 = 41,
    //% block="machine 43"
    M43 = 42,
    //% block="machine 44"
    M44 = 43,
    //% block="machine 45"
    M45 = 44,
    //% block="machine 46"
    M46 = 45,
    //% block="machine 47"
    M47 = 46,
    //% block="machine 48"
    M48 = 47,
    //% block="machine 49"
    M49 = 48,
    //% block="machine 50"
    M50 = 49,
    //% block="machine 51"
    M51 = 50,
    //% block="machine 52"
    M52 = 51,
    //% block="machine 53"
    M53 = 52,
    //% block="machine 54"
    M54 = 53,
    //% block="machine 55"
    M55 = 54,
    //% block="machine 56"
    M56 = 55,
    //% block="machine 57"
    M57 = 56,
    //% block="machine 58"
    M58 = 57,
    //% block="machine 59"
    M59 = 58,
    //% block="machine 60"
    M60 = 59,
    //% block="machine 61"
    M61 = 60,
    //% block="machine 62"
    M62 = 61,
    //% block="machine 63"
    M63 = 62,
    //% block="machine 64"
    M64 = 63,

}

// ─── Recipe types ────────────────────────────────────────────────────────────

declare const enum Recipe {
    //% block="Small Wheels"
    WheelPressSmall = 0,
    //% block="Medium Wheels"
    WheelPressMedium = 1,
    //% block="Large Wheels"
    WheelPressLarge = 2,
    //% block="Standard Batteries"
    BatteryAssemblyStandard = 3,
    //% block="High-Cap Batteries"
    BatteryAssemblyHigh = 4,
    //% block="Light Chassis"
    ChassisStamperLight = 5,
    //% block="Heavy Chassis"
    ChassisStamperHeavy = 6,
    //% block="Basic Circuits"
    CircuitPrinterBasic = 7,
    //% block="Advanced Circuits"
    CircuitPrinterAdvanced = 8,
    //% block="Basic Drivetrain"
    AssembleDrivetrainBasic = 9,
    //% block="Adv. Drivetrain"
    AssembleDrivetrainAdvanced = 10,
    //% block="Std. Power Unit"
    AssemblePowerUnitStandard = 11,
    //% block="High Power Unit"
    AssemblePowerUnitHigh = 12,
    //% block="Explorer Robot"
    AssembleRobotExplorer = 13,
    //% block="Worker Robot"
    AssembleRobotWorker = 14,
}

// ─── Belt slots ──────────────────────────────────────────────────────────────

declare const enum Belt {
    //% block="belt 1"
    Belt1 = 0,
    //% block="belt 2"
    Belt2 = 1,
    //% block="belt 3"
    Belt3 = 2,
    //% block="belt 4"
    Belt4 = 3,
    //% block="belt 5"
    Belt5 = 4,
    //% block="belt 6"
    Belt6 = 5,
    //% block="belt 7"
    Belt7 = 6,
    //% block="belt 8"
    Belt8 = 7,
    //% block="belt 9"
    Belt9 = 8,
    //% block="belt 10"
    Belt10 = 9,
    //% block="belt 11"
    Belt11 = 10,
    //% block="belt 12"
    Belt12 = 11,
    //% block="belt 13"
    Belt13 = 12,
    //% block="belt 14"
    Belt14 = 13,
    //% block="belt 15"
    Belt15 = 14,
    //% block="belt 16"
    Belt16 = 15,
    //% block="belt 17"
    Belt17 = 16,
    //% block="belt 18"
    Belt18 = 17,
    //% block="belt 19"
    Belt19 = 18,
    //% block="belt 20"
    Belt20 = 19,
    //% block="belt 21"
    Belt21 = 20,
    //% block="belt 22"
    Belt22 = 21,
    //% block="belt 23"
    Belt23 = 22,
    //% block="belt 24"
    Belt24 = 23,
    //% block="belt 25"
    Belt25 = 24,
    //% block="belt 26"
    Belt26 = 25,
    //% block="belt 27"
    Belt27 = 26,
    //% block="belt 28"
    Belt28 = 27,
    //% block="belt 29"
    Belt29 = 28,
    //% block="belt 30"
    Belt30 = 29,
    //% block="belt 31"
    Belt31 = 30,
    //% block="belt 32"
    Belt32 = 31,
    //% block="belt 33"
    Belt33 = 32,
    //% block="belt 34"
    Belt34 = 33,
    //% block="belt 35"
    Belt35 = 34,
    //% block="belt 36"
    Belt36 = 35,
    //% block="belt 37"
    Belt37 = 36,
    //% block="belt 38"
    Belt38 = 37,
    //% block="belt 39"
    Belt39 = 38,
    //% block="belt 40"
    Belt40 = 39,
    //% block="belt 41"
    Belt41 = 40,
    //% block="belt 42"
    Belt42 = 41,
    //% block="belt 43"
    Belt43 = 42,
    //% block="belt 44"
    Belt44 = 43,
    //% block="belt 45"
    Belt45 = 44,
    //% block="belt 46"
    Belt46 = 45,
    //% block="belt 47"
    Belt47 = 46,
    //% block="belt 48"
    Belt48 = 47,
    //% block="belt 49"
    Belt49 = 48,
    //% block="belt 50"
    Belt50 = 49,
    //% block="belt 51"
    Belt51 = 50,
    //% block="belt 52"
    Belt52 = 51,
    //% block="belt 53"
    Belt53 = 52,
    //% block="belt 54"
    Belt54 = 53,
    //% block="belt 55"
    Belt55 = 54,
    //% block="belt 56"
    Belt56 = 55,
    //% block="belt 57"
    Belt57 = 56,
    //% block="belt 58"
    Belt58 = 57,
    //% block="belt 59"
    Belt59 = 58,
    //% block="belt 60"
    Belt60 = 59,
    //% block="belt 61"
    Belt61 = 60,
    //% block="belt 62"
    Belt62 = 61,
    //% block="belt 63"
    Belt63 = 62,
    //% block="belt 64"
    Belt64 = 63,

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

// ─── Splitter output bitfield ────────────────────────────────────────────────
// Bitwise OR-combinable subsets of {Left, Forward, Right} that drive
// the splitter's persistent multiplexed output configuration.
// Keep in sync with SPLITTER_SIDE_BIT in src/game/types.ts.

declare const enum SplitterOutputs {
    //% block="left"
    Left = 1,
    //% block="forward"
    Forward = 2,
    //% block="left + forward"
    LeftForward = 3,
    //% block="right"
    Right = 4,
    //% block="left + right"
    LeftRight = 5,
    //% block="forward + right"
    ForwardRight = 6,
    //% block="left + forward + right"
    LeftForwardRight = 7,
}
