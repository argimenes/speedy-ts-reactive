import type { BlockTypeRegistration, CommandDefinition, CommandContext } from "./types";

export class BlockRegistry {
  private registrations = new Map<string, BlockTypeRegistration>();
  private aliases = new Map<string, string>();

  register(registration: BlockTypeRegistration): void {
    this.registrations.set(registration.type, registration);
    for (const alias of registration.aliases ?? []) this.aliases.set(alias, registration.type);
  }

  resolve(type: string): BlockTypeRegistration | undefined {
    return this.registrations.get(this.aliases.get(type) ?? type);
  }

  hasCapability(type: string, capability: string): boolean {
    return this.resolve(type)?.capabilities.includes(capability) ?? false;
  }
}

export class CommandRegistry {
  private commands = new Map<string, CommandDefinition<any>>();

  register<TArgs>(command: CommandDefinition<TArgs>): void {
    if (this.commands.has(command.id)) throw new Error(`Command ${command.id} is already registered`);
    this.commands.set(command.id, command);
  }

  canExecute<TArgs>(id: string, context: CommandContext<TArgs>): boolean {
    return this.commands.get(id)?.canExecute(context) ?? false;
  }

  execute<TArgs>(id: string, context: CommandContext<TArgs>): void | Promise<void> {
    const command = this.commands.get(id);
    if (!command) throw new Error(`Unknown command ${id}`);
    if (!command.canExecute(context)) throw new Error(`Command ${id} is not available for this target`);
    return command.execute(context);
  }

  list(): CommandDefinition<any>[] {
    return [...this.commands.values()];
  }
}
