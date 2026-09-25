<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('replay_attempts', function (Blueprint $table) {
            $table->id();
            $table->string('run_id');
            $table->string('attempt_id')->unique();
            $table->string('operation_id');
            $table->unsignedBigInteger('order_id');
            $table->unsignedSmallInteger('http_status');
            $table->unsignedInteger('order_count_after');
            $table->timestamp('attempted_at');
            $table->index('run_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('replay_attempts');
    }
};
