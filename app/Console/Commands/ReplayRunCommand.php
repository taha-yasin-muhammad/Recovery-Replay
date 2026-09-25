<?php

namespace App\Console\Commands;

use App\Replay\ReplayRunner;
use App\Replay\Scenarios\ProtectedCheckoutScenario;
use App\Replay\Scenarios\VulnerableCheckoutScenario;
use Illuminate\Console\Command;

class ReplayRunCommand extends Command
{
    protected $signature = 'replay:run
                            {scenario : Scenario name (checkout)}
                            {--mode=vulnerable : Execution mode (vulnerable|protected)}
                            {--json : Output a machine-readable JSON report}';

    protected $description = 'Run a replay scenario and evaluate idempotency behaviour';

    /** @var array<string, array<string, class-string>> */
    private const array SCENARIOS = [
        'checkout' => [
            'vulnerable' => VulnerableCheckoutScenario::class,
            'protected' => ProtectedCheckoutScenario::class,
        ],
    ];

    public function handle(): int
    {
        if (! app()->environment('local', 'testing')) {
            $this->error('replay:run may only be executed in local or testing environments.');

            return self::FAILURE;
        }

        $scenarioName = $this->argument('scenario');
        $mode = $this->option('mode');

        $scenarioClass = self::SCENARIOS[$scenarioName][$mode] ?? null;

        if ($scenarioClass === null) {
            $available = collect(self::SCENARIOS)
                ->flatMap(fn ($modes, $s) => collect($modes)->keys()->map(fn ($m) => "{$s} --mode={$m}"))
                ->join(', ');

            $this->error("Unknown scenario/mode combination \"{$scenarioName} --mode={$mode}\".");
            $this->line("Available: {$available}");

            return self::FAILURE;
        }

        $scenario = new $scenarioClass;
        $runner = new ReplayRunner($scenario);

        if (! $this->option('json')) {
            $this->info("Running scenario: {$scenario->label()}");
        }

        $report = $runner->run();

        if ($this->option('json')) {
            // Output clean JSON with no surrounding terminal formatting.
            $this->output->writeln(json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

            return $report['operation_safe'] ? self::SUCCESS : self::FAILURE;
        }

        $this->renderReport($report);

        return $report['operation_safe'] ? self::SUCCESS : self::FAILURE;
    }

    /**
     * @param  array<string, mixed>  $report
     */
    private function renderReport(array $report): void
    {
        $this->newLine();
        $this->line(' <fg=cyan>Run ID:</> '.$report['run_id']);
        $this->line(' <fg=cyan>Scenario:</> '.$report['scenario']);
        $this->newLine();

        $this->table(
            ['Attempt', 'HTTP Status', 'Order ID', 'Orders after'],
            collect($report['attempts'])->map(fn ($a) => [
                $a['attempt_id'],
                $a['http_status'],
                $a['order_id'],
                $a['order_count_after'],
            ])->all(),
        );

        $orderIds = implode(', ', $report['order_ids']);
        $this->line(" <fg=cyan>Distinct order IDs:</> {$orderIds}");
        $this->line(' <fg=cyan>Duplicate orders:</> '.($report['duplicate_orders'] ? 'yes' : 'no'));
        $this->line(' <fg=cyan>Same order on retry:</> '.($report['same_order_on_retry'] ? 'yes' : 'no'));
        $this->line(' <fg=cyan>Reproduction succeeded:</> '.($report['reproduction_succeeded'] ? 'yes' : 'no'));
        $this->line(' <fg=cyan>Operation safe:</> '.($report['operation_safe'] ? 'yes' : 'no'));
        $this->newLine();

        if ($report['operation_safe']) {
            $this->line(" <fg=green>✓ {$report['verdict']}</>");
        } elseif ($report['reproduction_succeeded']) {
            $this->line(" <fg=yellow>⚠ {$report['verdict']}</>");
        } else {
            $this->line(" <fg=red>✗ {$report['verdict']}</>");
        }

        $this->newLine();
    }
}
