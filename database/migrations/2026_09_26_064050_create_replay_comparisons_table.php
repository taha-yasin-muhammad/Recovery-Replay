<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('replay_comparisons', function (Blueprint $table) {
            $table->uuid('comparison_id')->primary();
            $table->string('resource_type');
            $table->string('before_run_id');
            $table->string('after_run_id');
            $table->timestamp('created_at')->useCurrent();

            $table->index('before_run_id');
            $table->index('after_run_id');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('replay_comparisons');
    }
};
