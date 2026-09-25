<?php

namespace App\Replay\Scenarios;

use App\Replay\ReplayScenario;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;
use RuntimeException;
use Symfony\Component\HttpFoundation\Request as SymfonyRequest;

/**
 * Vulnerable checkout scenario.
 *
 * Each attempt calls the unprotected /api/checkout endpoint in-process.
 * Without idempotency protection, a retry after a 503 creates a second order.
 */
class VulnerableCheckoutScenario implements ReplayScenario
{
    public function label(): string
    {
        return 'checkout (vulnerable)';
    }

    /**
     * @return array{attempt_id: string, http_status: int, resource_type: string|null, resource_id: int|null, order_id: int|null, response_body: array<string, mixed>}
     */
    public function attempt(string $runId, string $operationId, string $attemptId, bool $injectFault): array
    {
        return $this->dispatch('/api/checkout', [
            'operation_id' => $operationId,
            'run_id' => $runId,
            'attempt_id' => $attemptId,
            'inject_fault' => $injectFault,
        ], $attemptId);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{attempt_id: string, http_status: int, resource_type: string|null, resource_id: int|null, order_id: int|null, response_body: array<string, mixed>}
     */
    protected function dispatch(string $uri, array $data, string $attemptId): array
    {
        $content = json_encode($data);

        if ($content === false) {
            throw new RuntimeException('Failed to encode the replay request payload as JSON.');
        }

        $symfonyRequest = SymfonyRequest::create(
            url($uri),
            'POST',
            [],
            [],
            [],
            [
                'HTTP_ACCEPT' => 'application/json',
                'CONTENT_TYPE' => 'application/json',
                'CONTENT_LENGTH' => strlen($content),
            ],
            $content,
        );

        $request = Request::createFromBase($symfonyRequest);
        $kernel = app(Kernel::class);
        $response = $kernel->handle($request);
        $kernel->terminate($request, $response);

        $rawBody = $response->getContent();

        if ($rawBody === false) {
            throw new RuntimeException('Failed to read the replay response body.');
        }

        $body = $this->responseBody($rawBody);
        $orderId = isset($body['order_id']) && is_numeric($body['order_id']) ? (int) $body['order_id'] : null;

        return [
            'attempt_id' => $attemptId,
            'http_status' => $response->getStatusCode(),
            'resource_type' => 'order',
            'resource_id' => $orderId,
            'order_id' => $orderId,
            'response_body' => $body,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function responseBody(string $json): array
    {
        $decoded = json_decode($json, associative: true);

        if (! is_array($decoded)) {
            return [];
        }

        $body = [];

        foreach ($decoded as $key => $value) {
            if (! is_string($key)) {
                continue;
            }

            $body[$key] = $value;
        }

        return $body;
    }
}
