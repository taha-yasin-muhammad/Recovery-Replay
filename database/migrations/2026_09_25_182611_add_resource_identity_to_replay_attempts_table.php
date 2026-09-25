<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('replay_attempts', function (Blueprint $table) {
            // Make order_id nullable so reservation attempts can leave it unset.
            $table->unsignedBigInteger('order_id')->nullable()->change();

            // Generic resource identity columns — populated for all attempt types.
            $table->string('resource_type')->nullable()->after('order_id');
            $table->unsignedBigInteger('resource_id')->nullable()->after('resource_type');
        });

        // Back-fill resource_type and resource_id for existing checkout rows.
        DB::table('replay_attempts')
            ->whereNotNull('order_id')
            ->update([
                'resource_type' => 'order',
                'resource_id' => DB::raw('order_id'),
            ]);
    }

    public function down(): void
    {
        Schema::table('replay_attempts', function (Blueprint $table) {
            $table->dropColumn(['resource_type', 'resource_id']);
            $table->unsignedBigInteger('order_id')->nullable(false)->change();
        });
    }
};
